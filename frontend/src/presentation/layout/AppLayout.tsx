import { useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import NavbarComponent from '../components/NavbarComponent';
import Sidebar from '../components/Sidebar';
import SettingsDrawer from '../components/SettingsDrawer';

interface AppLayoutProps {
  children: ReactNode;
  editor?: Editor | null;
}

export default function AppLayout({ children, editor }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="h-full w-full flex flex-col bg-canvas text-ink overflow-hidden">
      <NavbarComponent
        editor={editor}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex-1 flex min-h-0">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 relative overflow-y-auto overflow-x-hidden min-w-0">
          {children}
        </main>
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}