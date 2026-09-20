import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import NavbarComponent from '../components/NavbarComponent';
import Sidebar from '../components/Sidebar';
import SettingsDrawer from '../components/SettingsDrawer';
import type { PageSettings } from '../../domain/models/PageSettings';

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
  pageSettings?: PageSettings;
  onPageSettingsChange?: (next: PageSettings) => void;
  zoom?: number;
  onZoomChange?: (next: number) => void;
  onEditHeaderFooter?: () => void;
  showRuler?: boolean;
  onToggleRuler?: () => void;
  showStatusBar?: boolean;
  onToggleStatusBar?: () => void;
  onFindReplace?: () => void;
  onWordCount?: () => void;
  onHelp?: () => void;
  onVersionHistory?: () => void;
  title?: string;
  onTitleChange?: (value: string) => void;
  titleStatus?: ReactNode;
  onImageUpload?: () => void;
  onInsertToc?: () => void;
  onAddComment?: () => void;
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
  pageSettings,
  onPageSettingsChange,
  zoom,
  onZoomChange,
  onEditHeaderFooter,
  showRuler,
  onToggleRuler,
  showStatusBar,
  onToggleStatusBar,
  onFindReplace,
  onWordCount,
  onHelp,
  onVersionHistory,
  title,
  onTitleChange,
  titleStatus,
  onImageUpload,
  onInsertToc,
  onAddComment,
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
        pageSettings={pageSettings}
        onPageSettingsChange={onPageSettingsChange}
        zoom={zoom}
        onZoomChange={onZoomChange}
        onEditHeaderFooter={onEditHeaderFooter}
        showRuler={showRuler}
        onToggleRuler={onToggleRuler}
        showStatusBar={showStatusBar}
        onToggleStatusBar={onToggleStatusBar}
        onFindReplace={onFindReplace}
        onWordCount={onWordCount}
        onHelp={onHelp}
        onVersionHistory={onVersionHistory}
        title={title}
        onTitleChange={onTitleChange}
        titleStatus={titleStatus}
        onImageUpload={onImageUpload}
        onInsertToc={onInsertToc}
        onAddComment={onAddComment}
      />

      <div className="flex-1 flex min-h-0">
        {isEditing && <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} editor={editor} />}

        <main className="app-main flex-1 relative overflow-y-auto overflow-x-hidden min-w-0">
          {children}
        </main>
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}