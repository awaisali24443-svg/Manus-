import { useState, useRef, useEffect } from "react";
import { Send, Terminal, FileText, CheckCircle, Loader2, Bot, User, Plus, Folder, ChevronRight } from "lucide-react";
import { cn } from "./lib/utils";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";

type ToolCall = {
  name: string;
  args: any;
  result?: string;
  status: "pending" | "success" | "error";
};

type Message = {
  id: string;
  role: "user" | "agent";
  text: string;
  toolCalls?: ToolCall[];
  status?: string;
};

type Project = {
  id: string;
  name: string;
  goal: string;
  status: string;
};

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectGoal, setNewProjectGoal] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (activeProjectId) {
      fetchMessages(activeProjectId);
    } else {
      setMessages([]);
    }
  }, [activeProjectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data);
    } catch (e) {
      console.error("Failed to fetch projects", e);
    }
  };

  const fetchMessages = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}/messages`);
      const data = await res.json();
      // Map DB messages to UI format
      const formatted = data.map((m: any) => ({
        id: m.id,
        role: m.role,
        text: m.content || "",
        toolCalls: m.tool_calls ? m.tool_calls.map((tc: any) => ({
          name: tc.name || tc.functionResponse?.name,
          args: tc.args || {},
          status: "success" // historical calls are assumed success for UI simplicity
        })) : []
      }));
      setMessages(formatted);
    } catch (e) {
      console.error("Failed to fetch messages", e);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !newProjectGoal.trim()) return;
    
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName, goal: newProjectGoal }),
      });
      const project = await res.json();
      setProjects([project, ...projects]);
      setActiveProjectId(project.id);
      setIsCreating(false);
      setNewProjectName("");
      setNewProjectGoal("");
      
      // Auto-start the agent with the goal
      handleAgentPrompt(project.id, `Goal: ${newProjectGoal}`);
    } catch (e) {
      console.error("Failed to create project", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !activeProjectId) return;
    const prompt = input;
    setInput("");
    await handleAgentPrompt(activeProjectId, prompt);
  };

  const handleAgentPrompt = async (projectId: string, prompt: string) => {
    const userMsg: Message = { id: Date.now().toString(), role: "user", text: prompt };
    const agentMsgId = (Date.now() + 1).toString();
    
    setMessages((prev) => [...prev, userMsg, { id: agentMsgId, role: "agent", text: "", toolCalls: [], status: "Initializing..." }]);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\\n\\n");
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                
                setMessages((prev) => prev.map(msg => {
                  if (msg.id !== agentMsgId) return msg;

                  const newMsg = { ...msg };

                  if (data.type === "status") {
                    newMsg.status = data.message;
                  } else if (data.type === "tool_call") {
                    newMsg.toolCalls = [...(newMsg.toolCalls || []), { name: data.name, args: data.args, status: "pending" }];
                  } else if (data.type === "tool_result") {
                    if (newMsg.toolCalls) {
                      const lastCall = newMsg.toolCalls[newMsg.toolCalls.length - 1];
                      if (lastCall && lastCall.name === data.name) {
                        lastCall.result = data.result;
                        lastCall.status = data.result.startsWith("Error") ? "error" : "success";
                      }
                    }
                  } else if (data.type === "text") {
                    newMsg.text += data.text;
                    newMsg.status = undefined;
                  } else if (data.type === "done") {
                    newMsg.status = undefined;
                  }

                  return newMsg;
                }));
              } catch (e) {
                console.error("Error parsing SSE data:", e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => prev.map(msg => 
        msg.id === agentMsgId ? { ...msg, status: "Error occurred.", text: "Sorry, I encountered an error." } : msg
      ));
    } finally {
      setIsLoading(false);
      fetchMessages(projectId); // Refresh to get exact DB state
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-gray-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-white/10 bg-[#0F0F0F] flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            <span className="font-medium tracking-tight">Manus Platform</span>
          </div>
        </div>
        
        <div className="p-4">
          <button 
            onClick={() => setIsCreating(true)}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> New Project
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">Projects</div>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => setActiveProjectId(p.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                activeProjectId === p.id ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
              )}
            >
              <Folder className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        {isCreating ? (
          <div className="absolute inset-0 z-20 bg-[#0A0A0A]/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-xl font-medium mb-4">Create New Project</h2>
              <form onSubmit={handleCreateProject} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Project Name</label>
                  <input 
                    type="text" 
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. React Todo App"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Goal</label>
                  <textarea 
                    value={newProjectGoal}
                    onChange={e => setNewProjectGoal(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 min-h-[100px] resize-none"
                    placeholder="Describe what the agent should build..."
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setIsCreating(false)}
                    className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={!newProjectName.trim() || !newProjectGoal.trim()}
                    className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    Create & Start
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {!activeProjectId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <Bot className="w-12 h-12 mb-4 opacity-20" />
            <p>Select a project or create a new one to begin.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0A0A0A]/80 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-medium tracking-tight">
                  {projects.find(p => p.id === activeProjectId)?.name || "Project"}
                </h1>
              </div>
            </header>

            {/* Chat Area */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-8 scroll-smooth">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex gap-4 max-w-4xl mx-auto", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                  {/* Avatar */}
                  <div className="flex-shrink-0 mt-1">
                    {msg.role === "user" ? (
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
                        <User className="w-4 h-4 text-gray-300" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Message Content */}
                  <div className={cn("flex flex-col gap-2 max-w-[85%]", msg.role === "user" ? "items-end" : "items-start")}>
                    {msg.role === "user" ? (
                      <div className="bg-white/10 text-white px-5 py-3 rounded-2xl rounded-tr-sm border border-white/5">
                        {msg.text}
                      </div>
                    ) : (
                      <div className="w-full space-y-4">
                        {/* Tool Calls */}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="space-y-2">
                            {msg.toolCalls.map((call, idx) => (
                              <motion.div 
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                key={idx} 
                                className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden text-sm font-mono"
                              >
                                <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border-b border-white/5">
                                  {call.status === "pending" ? (
                                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                                  ) : call.status === "success" ? (
                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                  ) : (
                                    <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/50">
                                      <span className="text-[10px] text-red-500">!</span>
                                    </div>
                                  )}
                                  <span className="text-gray-300 font-medium">
                                    {call.name === "run_command" ? "Executing Command" : 
                                     call.name === "write_file" ? "Writing File" : 
                                     call.name === "read_file" ? "Reading File" : call.name}
                                  </span>
                                </div>
                                <div className="p-4 space-y-3">
                                  <div className="text-gray-400">
                                    {call.name === "run_command" && (
                                      <div className="flex items-start gap-2">
                                        <Terminal className="w-4 h-4 mt-0.5 text-gray-500" />
                                        <span className="text-indigo-300">{call.args.command}</span>
                                      </div>
                                    )}
                                    {call.name === "write_file" && (
                                      <div className="flex items-start gap-2">
                                        <FileText className="w-4 h-4 mt-0.5 text-gray-500" />
                                        <div className="flex flex-col gap-1">
                                          <span className="text-purple-300">{call.args.path}</span>
                                          <span className="text-gray-500 line-clamp-2 text-xs">{call.args.content}</span>
                                        </div>
                                      </div>
                                    )}
                                    {call.name === "read_file" && (
                                      <div className="flex items-start gap-2">
                                        <FileText className="w-4 h-4 mt-0.5 text-gray-500" />
                                        <span className="text-emerald-300">{call.args.path}</span>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {call.result && (
                                    <div className="mt-2 pt-2 border-t border-white/5">
                                      <div className={cn(
                                        "text-xs whitespace-pre-wrap max-h-32 overflow-y-auto rounded bg-black/50 p-2 border",
                                        call.status === "error" ? "text-red-400 border-red-500/20" : "text-gray-400 border-white/5"
                                      )}>
                                        {call.result}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        )}

                        {/* Status Indicator */}
                        {msg.status && (
                          <div className="flex items-center gap-2 text-sm text-gray-400 animate-pulse">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {msg.status}
                          </div>
                        )}

                        {/* Final Text Response */}
                        {msg.text && (
                          <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-[#121212] prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl">
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </main>

            {/* Input Area */}
            <div className="p-4 sm:p-6 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] to-transparent">
              <div className="max-w-4xl mx-auto relative">
                <form 
                  onSubmit={handleSubmit}
                  className="relative flex items-end gap-2 bg-[#1A1A1A] border border-white/10 rounded-2xl p-2 shadow-2xl focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all"
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    placeholder="Give the agent a new instruction..."
                    className="w-full max-h-64 min-h-[52px] bg-transparent text-white placeholder-gray-500 resize-none outline-none py-3 px-4 leading-relaxed"
                    rows={1}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="flex-shrink-0 w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center disabled:opacity-50 disabled:bg-white/10 disabled:text-white/50 transition-colors hover:bg-gray-200"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
