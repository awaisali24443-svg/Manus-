import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';

let db: Database | null = null;

export async function initDB() {
  if (db) return db;
  
  db = await open({
    filename: './manus_platform.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      goal TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      path TEXT NOT NULL,
      content TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, path),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  return db;
}

export async function createProject(name: string, goal: string) {
  const database = await initDB();
  const id = uuidv4();
  await database.run('INSERT INTO projects (id, name, goal) VALUES (?, ?, ?)', [id, name, goal]);
  return { id, name, goal };
}

export async function getProjects() {
  const database = await initDB();
  return database.all('SELECT * FROM projects ORDER BY created_at DESC');
}

export async function getProject(id: string) {
  const database = await initDB();
  return database.get('SELECT * FROM projects WHERE id = ?', [id]);
}

export async function saveMessage(projectId: string, role: string, content: string, toolCalls?: any) {
  const database = await initDB();
  const id = uuidv4();
  await database.run(
    'INSERT INTO messages (id, project_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?)',
    [id, projectId, role, content, toolCalls ? JSON.stringify(toolCalls) : null]
  );
  return id;
}

export async function getMessages(projectId: string) {
  const database = await initDB();
  const msgs = await database.all('SELECT * FROM messages WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
  return msgs.map(m => ({
    ...m,
    tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined
  }));
}

// Virtual File System DB operations
export async function writeFile(projectId: string, path: string, content: string) {
  const database = await initDB();
  const id = uuidv4();
  await database.run(`
    INSERT INTO files (id, project_id, path, content, updated_at) 
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP
  `, [id, projectId, path, content]);
}

export async function readFile(projectId: string, path: string) {
  const database = await initDB();
  const file = await database.get('SELECT content FROM files WHERE project_id = ? AND path = ?', [projectId, path]);
  if (!file) throw new Error(`File not found: ${path}`);
  return file.content;
}

export async function listFiles(projectId: string) {
  const database = await initDB();
  const files = await database.all('SELECT path FROM files WHERE project_id = ?', [projectId]);
  return files.map(f => f.path);
}
