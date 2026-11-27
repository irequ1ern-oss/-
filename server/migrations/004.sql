CREATE TABLE attachments(user_id INTEGER NOT NULL REFERENCES users(id),id TEXT NOT NULL,task TEXT NOT NULL,name TEXT NOT NULL,body BLOB NOT NULL,PRIMARY KEY(user_id,id));
CREATE INDEX attachments_task ON attachments(user_id,task);
