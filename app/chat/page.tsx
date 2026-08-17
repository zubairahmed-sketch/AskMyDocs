'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ChatWindow } from '@/components/chat/ChatWindow';

export default function ChatPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);

  return (
    <AppShell>
      <div className="flex-1 flex flex-col h-[calc(100vh-theme(spacing.14))] md:h-screen">
        <ChatWindow
          conversationId={conversationId}
          onConversationCreated={setConversationId}
        />
      </div>
    </AppShell>
  );
}
