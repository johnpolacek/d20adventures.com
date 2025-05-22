"use client";
import { useState } from "react";
import { useTurnStore } from "@/lib/store/turn-store";
import { Textarea } from "@/components/ui/textarea";

export default function TurnNarrativeEditor() {
  const [input, setInput] = useState("");
  const updateNarrative = useTurnStore((state) => state.updateNarrative);

  const handleReply = () => {
    if (input.trim()) {
      updateNarrative(input);
      setInput("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={input}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
        placeholder="Write your character's actions and dialogue in the third person..."
      />
      <button
        className="self-end px-4 py-2 rounded bg-primary-700 text-white font-bold hover:bg-primary-800 transition"
        onClick={handleReply}
        disabled={!input.trim()}
      >
        Reply
      </button>
    </div>
  );
} 