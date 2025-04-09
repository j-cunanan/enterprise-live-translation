"use client";

import { useEffect, useState } from "react";

export default function Transcription() {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/transcriptions");

    ws.onmessage = (event) => {
      setMessages((prev) => [...prev, event.data]);
    };

    return () => ws.close();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Transcriptions</h1>
      <div className="space-y-2">
        {messages.map((message, index) => (
          <div
            key={index}
            className="p-2 border rounded-md shadow-sm bg-gray-50"
          >
            {message}
          </div>
        ))}
      </div>
    </div>
  );
}
