import { useState, useEffect, useRef } from 'react';
import { Send, RotateCcw, Trash2 } from 'lucide-react';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('chat_sms_messages');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Save messages in localStorage
  useEffect(() => {
    try {
      localStorage.setItem('chat_sms_messages', JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages]);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = input.trim();
    if (!textToSend || isLoading) return;

    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', text: textToSend }];
    setMessages(newMessages);

    // Placeholder for AI streaming
    setMessages((prev) => [...prev, { role: 'model', text: '' }]);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          systemInstruction: 'You are a helpful, simple and direct AI. Reply clearly and directly in the user\'s language without extra fluff.',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('সার্ভারে সমস্যা হয়েছে।');
      }

      if (!response.body) {
        throw new Error('No stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponseText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                aiResponseText += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'model') {
                    last.text = aiResponseText;
                  }
                  return updated;
                });
              }
            } catch {
              // ignore json parse error for partial chunk
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'model' && !last.text) {
            last.text = 'বার্তা পাঠানো সম্ভব হয়নি। আবার চেষ্টা করুন।';
          }
          return updated;
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleClear = () => {
    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    localStorage.removeItem('chat_sms_messages');
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#1e1e24] text-white">
      {/* Simple Header */}
      <header className="h-13 bg-[#18181c] border-b border-[#2c2c34] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
          <span className="font-semibold text-base tracking-wide">AI Chat</span>
        </div>

        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 px-2 py-1 rounded transition-colors"
            title="সব মেসেজ মুছুন"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>মুছুন</span>
          </button>
        )}
      </header>

      {/* Chat Messages / SMS Thread */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 p-4 select-none">
            <p className="text-base text-gray-300 font-medium">যেকোনো প্রশ্ন বা মেসেজ লিখুন</p>
            <p className="text-xs text-gray-400 mt-1">সরাসরি রিয়েল-টাইম উত্তর পাবেন</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={index}
                className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap ${
                    isUser
                      ? 'bg-emerald-600 text-white rounded-br-xs'
                      : 'bg-[#2a2a32] text-gray-100 rounded-bl-xs border border-[#383842]'
                  }`}
                >
                  {msg.text || (
                    <span className="inline-flex gap-1 py-1">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Bottom SMS Input Bar */}
      <footer className="p-3 bg-[#18181c] border-t border-[#2c2c34] shrink-0">
        <form onSubmit={handleSend} className="flex items-center gap-2 max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="মেসেজ লিখুন..."
            className="flex-1 bg-[#2a2a32] text-white px-4 py-3 rounded-full text-[15px] focus:outline-none focus:ring-1 focus:ring-emerald-500 border border-[#383842]"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              input.trim() && !isLoading
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : 'bg-[#2a2a32] text-gray-500 cursor-not-allowed border border-[#383842]'
            }`}
          >
            {isLoading ? (
              <RotateCcw className="w-4 h-4 animate-spin text-emerald-400" />
            ) : (
              <Send className="w-4 h-4 ml-0.5" />
            )}
          </button>
        </form>
      </footer>
    </div>
  );
}
