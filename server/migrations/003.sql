CREATE TABLE push_devices(endpoint TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),subscription TEXT NOT NULL);
CREATE TABLE push_queue(notice INTEGER NOT NULL REFERENCES notices(id),endpoint TEXT NOT NULL REFERENCES push_devices(endpoint) ON DELETE CASCADE,attempts INTEGER NOT NULL DEFAULT 0,available INTEGER NOT NULL,PRIMARY KEY(notice,endpoint));
