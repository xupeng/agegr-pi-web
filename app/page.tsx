import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { StandaloneTopBar } from "@/components/StandaloneTopBar";
import { I18nProvider } from "@/hooks/useI18n";

// AppShell reads the URL through useSearchParams. A static production prerender
// bails that tree out to the client, so the installed iOS app's first paint has
// no opaque fixed header and the system blur stays. Render on each request,
// and keep a fixed shell visible if the search-param boundary still suspends.
export const dynamic = "force-dynamic";

function TopBarShell() {
  return <StandaloneTopBar sidebarWidth={0}><span /></StandaloneTopBar>;
}

export default function Home() {
  return (
    <Suspense fallback={<TopBarShell />}>
      <I18nProvider>
        <AppShell />
      </I18nProvider>
    </Suspense>
  );
}
