import { LLMRouter } from './llm';
import { Sandbox } from './sandbox';
import { saveMessage } from './db';

export class Orchestrator {
  projectId: string;
  sandbox: Sandbox;
  llm: LLMRouter;
  sendEvent: (type: string, data: any) => void;

  constructor(projectId: string, sendEvent: (type: string, data: any) => void) {
    this.projectId = projectId;
    this.sandbox = new Sandbox(projectId);
    this.llm = new LLMRouter();
    this.sendEvent = sendEvent;
  }

  async runLoop(prompt: string) {
    this.sendEvent("status", { message: "Initializing Manus Loop..." });

    const systemInstruction = `You are an autonomous AI software engineer system (Manus AI Platform).
Your goal is to complete the user's task by continuously thinking, acting, observing results, and improving.
You have access to a persistent virtual file system and a simulated terminal scoped to this project.
Follow the loop: PLAN -> CREATE -> EXECUTE -> OBSERVE -> FIX -> REPEAT.
Always use tools to explore, read, write, and execute.
Do not stop until the task is fully complete.`;

    const chat = this.llm.createChatSession(systemInstruction);
    
    await saveMessage(this.projectId, 'user', prompt);
    this.sendEvent("status", { message: "Thinking (PLAN phase)..." });

    let response = await chat.sendMessage({ message: prompt });
    let loopCount = 0;
    const MAX_LOOPS = 20;

    while (response.functionCalls && response.functionCalls.length > 0 && loopCount < MAX_LOOPS) {
      loopCount++;
      const functionResponses: any[] = [];
      
      // Save the AI's thought/tool call intent
      await saveMessage(this.projectId, 'agent', response.text || '', response.functionCalls);

      for (const call of response.functionCalls) {
        const { name, args } = call;
        this.sendEvent("tool_call", { name, args });

        let result = "";
        try {
          if (name === "read_file") {
            result = await this.sandbox.read(args.path as string);
          } else if (name === "write_file") {
            result = await this.sandbox.write(args.path as string, args.content as string);
          } else if (name === "run_command") {
            result = await this.sandbox.executeCommand(args.command as string);
          } else {
            result = `Error: Unknown tool ${name}`;
          }
        } catch (e: any) {
          result = `Error executing tool: ${e.message}`;
        }

        this.sendEvent("tool_result", { name, result });
        functionResponses.push({
          functionResponse: { name, response: { result } },
        });
      }

      this.sendEvent("status", { message: "Reflecting on results (OBSERVE & FIX phase)..." });
      response = await chat.sendMessage({ message: functionResponses });
    }

    if (loopCount >= MAX_LOOPS) {
      const msg = "\\n\\n*Agent stopped: Reached maximum loop iterations.*";
      await saveMessage(this.projectId, 'agent', msg);
      this.sendEvent("text", { text: msg });
    } else if (response.text) {
      await saveMessage(this.projectId, 'agent', response.text);
      this.sendEvent("text", { text: response.text });
    }

    this.sendEvent("done", {});
  }
}
