-- Database setup for Slidea
-- Run this in your PostgreSQL database

CREATE TABLE IF NOT EXISTS presentations (
  id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  prompt TEXT NOT NULL,
  filename VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_presentations_created_at ON presentations(created_at DESC);

-- Insert some sample data (optional)
-- INSERT INTO presentations (id, title, prompt, filename, created_at)
-- VALUES ('sample1', 'Sample Presentation', 'This is a sample presentation', 'presentation_sample1.pptx', NOW());
