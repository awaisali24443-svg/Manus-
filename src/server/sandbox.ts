import { writeFile, readFile, listFiles } from './db';

export class Sandbox {
  projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  async write(path: string, content: string): Promise<string> {
    try {
      await writeFile(this.projectId, path, content);
      return `Successfully wrote to ${path}`;
    } catch (e: any) {
      return `Error writing file: ${e.message}`;
    }
  }

  async read(path: string): Promise<string> {
    try {
      return await readFile(this.projectId, path);
    } catch (e: any) {
      return `Error reading file: ${e.message}`;
    }
  }

  async executeCommand(command: string): Promise<string> {
    // Safety check: block destructive commands
    const dangerous = ['rm -rf /', 'mkfs', 'dd if=', '> /dev/sda'];
    if (dangerous.some(d => command.includes(d))) {
      return `Error: Command blocked for security reasons.`;
    }

    // In a real deployment, this would use child_process.exec inside a Docker container.
    // For this platform, we simulate execution based on the command type,
    // or interact with the virtual file system.
    
    if (command.startsWith('ls')) {
      const files = await listFiles(this.projectId);
      return files.length > 0 ? files.join('\\n') : '(empty directory)';
    }
    
    if (command.startsWith('cat ')) {
      const path = command.replace('cat ', '').trim();
      return await this.read(path);
    }

    if (command.includes('npm') || command.includes('yarn') || command.includes('build')) {
      return `[Simulated Execution] Running: ${command}\\n...\\nSuccess: Command completed with exit code 0.`;
    }

    return `[Simulated Execution] Command: ${command}\\nOutput: Executed successfully in sandbox.`;
  }
}
