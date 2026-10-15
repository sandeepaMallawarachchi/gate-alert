import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PageShell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col pb-28 lg:pb-8">
      <header className="sticky top-3 z-30 mx-3 mt-3 flex items-center gap-2 px-2 py-2 glass rounded-full">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </header>
      <main className="w-full max-w-md mx-auto px-4 pt-6">{children}</main>
    </div>
  );
};
export default PageShell;
