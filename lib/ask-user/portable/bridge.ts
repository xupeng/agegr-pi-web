/**
 * Explicit, loader-scoped host bridge for the portable `ask_user` extension.
 *
 * A Pi extension package cannot own pending-ask state, a browser card, an
 * authenticated submit route, or follow-up delivery. Instead the package entry
 * registers a tool that, at execution time, asks the host for a single `open`
 * function over the SDK's loader-scoped event bus:
 *
 *   1. the package validates the bounded question set (shared validator),
 *   2. it emits {@link ASK_USER_BRIDGE_CHANNEL} with a mutable request,
 *   3. exactly one host listener must synchronously call `request.register`,
 *   4. the package awaits the host's `open`, which must durably register the
 *      ask and return a valid acknowledgement, or throw.
 *
 * Failure is closed at every step: no bridge, more than one bridge, an
 * asynchronous registration, a rejected `open`, or a malformed acknowledgement
 * all throw. The tool then becomes an error tool result and no pending ask is
 * ever pretended to exist. There is no ambient global and no default adapter:
 * a host that has not opted in simply cannot answer `ask_user`.
 *
 * The event bus is per resource loader. A listener attached to a different
 * loader cannot satisfy this call, which is what keeps Pi Web's in-process
 * adapter from leaking into another host.
 */

import {
  ASK_USER_ID_MAX_LENGTH,
  ASK_USER_QUESTION_LIMIT,
  ASK_USER_TEXT_MAX_LENGTH,
  type AskUserOutcome,
  type AskUserQuestion,
  type AskUserQuestionOption,
  type PendingAskOpenResult,
} from "./types";
import { cloneQuestion, validateQuestions } from "./validation";

/** Namespaced, versioned channel a host listens on to supply its `open`. */
export const ASK_USER_BRIDGE_CHANNEL = "pi.ask-user.bridge:resolve-open:v1";
/** Wire version of {@link AskUserBridgeRequest}; hosts must reject unknown values. */
export const ASK_USER_BRIDGE_VERSION = 1;

/** What a host receives once, at `ask_user` execution time. */
export interface AskUserBridgeRequest {
  /** {@link ASK_USER_BRIDGE_VERSION} of this request. */
  version: number;
  /** Opaque conversation identity of the session that called `ask_user`. */
  conversationId: string;
  /** Bounded questions already checked by the shared validator. */
  questions: AskUserQuestion[];
}

/**
 * Host-owned registration. It must durably record the ask (memory, disk, UI)
 * before resolving, and return the registered ask plus the outcome of any ask
 * it superseded. Rejecting is a hard failure: the model sees an error result
 * and no card is promised.
 */
export type AskUserBridgeOpen = (request: AskUserBridgeRequest) => Promise<PendingAskOpenResult>;

/** Mutable registration handle handed to host listeners during a resolution. */
export interface AskUserBridgeResolution {
  register(open: AskUserBridgeOpen): void;
}

/** Minimal structural view of the SDK event bus; avoids importing the SDK here. */
export interface AskUserBridgeEventBus {
  emit(channel: string, data: unknown): void;
}

/** A missing, ambiguous, or misbehaving host bridge. */
export class AskUserBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskUserBridgeError";
  }
}

export interface OpenAskThroughBridgeInput {
  conversationId: string;
  questions: AskUserQuestion[];
}

/**
 * Resolve exactly one host `open` and register the validated ask through it.
 *
 * The emit and the collection of registrations happen synchronously inside
 * this call. Host listeners are required to register before doing any
 * asynchronous work; a listener that awaits first is treated as absent rather
 * than racing the result.
 */
export async function openAskThroughBridge(
  bus: AskUserBridgeEventBus,
  input: OpenAskThroughBridgeInput,
): Promise<PendingAskOpenResult> {
  if (input.conversationId === "") {
    throw new AskUserBridgeError("ask_user: host bridge requires a non-empty conversationId");
  }
  // Validate before emitting: a malformed ask must not reach a host at all.
  const questions = validateQuestions(input.questions);

  let open: AskUserBridgeOpen | undefined;
  let registrations = 0;
  let accepting = true;
  const request: AskUserBridgeResolution = {
    register(candidate) {
      if (!accepting || typeof candidate !== "function") return;
      registrations += 1;
      if (registrations === 1) open = candidate;
    },
  };
  // The SDK event bus dispatch is synchronous and swallows listener errors, so
  // `emit` returning says nothing about registration. Count the calls instead.
  bus.emit(ASK_USER_BRIDGE_CHANNEL, request);
  accepting = false;

  if (registrations !== 1 || open === undefined) {
    throw new AskUserBridgeError(
      `ask_user: expected exactly one synchronous host bridge on "${ASK_USER_BRIDGE_CHANNEL}" (got ${registrations.toString()})`,
    );
  }

  // Hand the host a clone so an in-place mutation cannot rewrite the
  // snapshot we later compare the acknowledgement against.
  const delivered = questions.map(cloneQuestion);
  const acknowledgement: unknown = await open({
    version: ASK_USER_BRIDGE_VERSION,
    conversationId: input.conversationId,
    questions: delivered,
  });
  return readDurableAck(acknowledgement, questions);
}

/**
 * A successful `open` must acknowledge the same validated questions the host
 * was given, plus a reportable supersede outcome when one is present.
 * Anything else is a hard failure: the tool must not return `terminate: true`
 * for an ask whose identity we cannot confirm, or for a supersede notice that
 * would drop or mis-name the questions the user never answered.
 *
 * The returned ask uses the validated snapshot, not the host object, so extra
 * host fields cannot leak into the model-facing result after identity matched.
 */
function readDurableAck(value: unknown, expected: AskUserQuestion[]): PendingAskOpenResult {
  if (!isRecord(value)) {
    throw new AskUserBridgeError("ask_user: host bridge returned no durable acknowledgement");
  }
  const ask = value.ask;
  if (!isRecord(ask)) {
    throw new AskUserBridgeError("ask_user: host bridge acknowledgement is missing the registered ask");
  }
  const askId = readAckId(ask.askId, "askId");
  const askedAt = readAckTimestamp(ask.askedAt, "askedAt");
  assertQuestionIdentity(ask.questions, expected);
  const superseded = readSuperseded(value.superseded);
  return {
    ask: { askId, askedAt, questions: expected.map(cloneQuestion) },
    ...(superseded === undefined ? {} : { superseded }),
  };
}

function assertQuestionIdentity(acked: unknown, expected: AskUserQuestion[]): void {
  if (!Array.isArray(acked) || acked.length !== expected.length || expected.some((question, index) => !sameQuestion(acked[index], question))) {
    throw new AskUserBridgeError("ask_user: host bridge acknowledgement questions do not match the validated ask");
  }
}

function sameQuestion(value: unknown, expected: AskUserQuestion): boolean {
  if (!isRecord(value)) return false;
  if (value.id !== expected.id || value.question !== expected.question) return false;
  if (optionalText(value.detail) !== expected.detail) return false;
  if ((value.multiple === true) !== (expected.multiple === true)) return false;
  const options = value.options;
  if (!Array.isArray(options) || options.length !== expected.options.length) return false;
  return expected.options.every((option, index) => sameOption(options[index], option));
}

function sameOption(value: unknown, expected: AskUserQuestionOption): boolean {
  if (!isRecord(value)) return false;
  return value.value === expected.value
    && value.label === expected.label
    && optionalText(value.detail) === expected.detail;
}

/**
 * A present `superseded` must be honest enough to render: the replaced ask's
 * id, reason `superseded`, and the unanswered question ids. A missing field, a
 * different close reason, or a non-string id list fails closed instead of
 * throwing inside the notice renderer after the host already returned.
 */
function readSuperseded(value: unknown): AskUserOutcome | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new AskUserBridgeError("ask_user: host bridge superseded acknowledgement is not an object");
  }
  if (value.reason !== "superseded") {
    throw new AskUserBridgeError("ask_user: host bridge superseded acknowledgement must have reason \"superseded\"");
  }
  const askId = readAckId(value.askId, "superseded askId");
  const unansweredIds = readUnansweredIds(value.unansweredIds);
  // Boundary assertion: the fields the notice renderer reads are checked
  // above. Remaining outcome fields are host-owned and are not rewritten.
  return { ...value, askId, reason: "superseded", unansweredIds } as AskUserOutcome;
}

function readUnansweredIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > ASK_USER_QUESTION_LIMIT) {
    throw new AskUserBridgeError("ask_user: host bridge superseded acknowledgement has no unanswered id list");
  }
  const ids: string[] = [];
  for (const id of value) {
    const read = readAckId(id, "superseded unanswered id");
    if (ids.includes(read)) {
      throw new AskUserBridgeError(`ask_user: host bridge superseded acknowledgement repeats unanswered id ${read}`);
    }
    ids.push(read);
  }
  return ids;
}

function readAckId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > ASK_USER_ID_MAX_LENGTH) {
    throw new AskUserBridgeError(`ask_user: host bridge acknowledgement has an invalid ${field}`);
  }
  return value;
}

function readAckTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > ASK_USER_TEXT_MAX_LENGTH) {
    throw new AskUserBridgeError(`ask_user: host bridge acknowledgement has an invalid ${field}`);
  }
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
