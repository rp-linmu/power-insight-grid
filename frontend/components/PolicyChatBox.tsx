"use client";

import { useState, useTransition } from "react";


type PolicyChatBoxProps = {
  policyId: number;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  evidence?: string[];
  mode?: string;
};


type ChatReply = {
  answer: string;
  evidence: string[];
  mode: string;
  remaining_quota?: number | null;
};


export default function PolicyChatBox({ policyId }: PolicyChatBoxProps) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const quickQuestions = [
    "这份政策对现货交易有什么影响？",
    "这份政策影响哪些市场主体？",
    "这份政策对申报和出清有什么要求？",
  ];

  const ask = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("请输入问题后再提问。");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("question", trimmed);
        formData.set(
          "history_json",
          JSON.stringify(messages.map((item) => ({ role: item.role, content: item.content })).slice(-8))
        );
        const response = await fetch(`/api/policies/${policyId}/chat`, {
          method: "POST",
          body: formData,
        });
        const data = (await response.json()) as ChatReply | { detail?: string };
        if (!response.ok) {
          throw new Error("detail" in data && data.detail ? data.detail : "chat_failed");
        }
        const typed = data as ChatReply;
        setMessages((current) => [
          ...current,
          { role: "user", content: trimmed },
          { role: "assistant", content: typed.answer, evidence: typed.evidence, mode: typed.mode },
        ]);
        setRemainingQuota(typed.remaining_quota ?? null);
        setQuestion("");
      } catch (err) {
        const text = err instanceof Error ? err.message : "本次问答未返回结果，请稍后重试。";
        setError(text);
      }
    });
  };

  return (
    <div className="policy-chat-box">
      <div className="policy-chat-head">
        <strong>政策问答</strong>
        <span className="muted">围绕当前这份文件继续追问</span>
      </div>
      <div className="policy-chat-quick">
        {quickQuestions.map((item) => (
          <button key={item} type="button" className="pager-chip" onClick={() => {
            setQuestion(item);
            ask(item);
          }}>
            {item}
          </button>
        ))}
      </div>
      <div className="policy-chat-form">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          placeholder="例如：这份政策对新能源场站报量报价有什么变化？"
        />
        <button className="filter-submit" type="button" disabled={isPending} onClick={() => ask(question)}>
          {isPending ? "解读中..." : "发送问题"}
        </button>
      </div>
      <div className="policy-chat-toolbar">
        <span className="muted">
          仅支持电力市场与能源市场相关提问
          {remainingQuota !== null ? `，本分钟剩余 ${remainingQuota} 次` : ""}
        </span>
        {messages.length > 0 ? (
          <button className="pager-chip" type="button" onClick={() => setMessages([])}>
            清空对话
          </button>
        ) : null}
      </div>
      {error ? <p className="policy-chat-error">{error}</p> : null}
      {messages.length > 0 ? (
        <div className="policy-chat-thread">
          {messages.map((message, index) => (
            <div
              className={`policy-chat-bubble ${message.role === "user" ? "policy-chat-bubble-user" : "policy-chat-bubble-assistant"}`}
              key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
            >
              <div className="policy-chat-mode">
                {message.role === "user"
                  ? "我的问题"
                  : message.mode === "llm"
                    ? "AI 问答"
                    : message.mode === "guard"
                      ? "范围提示"
                      : "规则问答"}
              </div>
              <p>{message.content}</p>
              {message.role === "assistant" && message.evidence && message.evidence.length > 0 ? (
                <div className="policy-chat-evidence">
                  <strong>相关依据</strong>
                  <div className="policy-point-list">
                    {message.evidence.map((item) => (
                      <div className="policy-point-item" key={item}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
