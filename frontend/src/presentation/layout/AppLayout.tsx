import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import NavbarComponent from '../components/NavbarComponent';
import Sidebar from '../components/Sidebar';
import SettingsDrawer from '../components/SettingsDrawer';

interface AppLayoutProps {
  children: ReactNode;
  editor?: Editor | null;
  onNew?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  onPrint?: () => void;
  onCloseDocument?: () => void;
  exporting?: boolean;
  importing?: boolean;
}

export default function AppLayout({
  children,
  editor,
  onNew,
  onImport,
  onExport,
  onPrint,
  onCloseDocument,
  exporting,
  importing,
}: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const location = useLocation();
  const isEditing = location.pathname.includes('/editor/');

  return (
    <div className="h-full w-full flex flex-col bg-canvas text-ink overflow-hidden">
      <NavbarComponent
        editor={editor}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
        onNew={onNew}
        onImport={onImport}
        onExport={onExport}
        onPrint={onPrint}
        onCloseDocument={onCloseDocument}
        exporting={exporting}
        importing={importing}
      />

      <div className="flex-1 flex min-h-0">
        {isEditing && <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />}

        <main className="flex-1 relative overflow-y-auto overflow-x-hidden min-w-0">
          {children}
        </main>
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}