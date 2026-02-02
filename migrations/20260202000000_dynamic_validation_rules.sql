-- Dynamic validation rules for allowed MIME types, signatures and blocked extensions

CREATE TABLE IF NOT EXISTS allowed_mimes (
    id SERIAL PRIMARY KEY,
    mime_type TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS magic_signatures (
    id SERIAL PRIMARY KEY,
    signature BYTEA NOT NULL,
    mime_type TEXT NOT NULL,
    description TEXT,
    UNIQUE (signature, mime_type)
);

CREATE TABLE IF NOT EXISTS blocked_extensions (
    id SERIAL PRIMARY KEY,
    extension TEXT UNIQUE NOT NULL,
    description TEXT
);

-- Ensure unique constraints exist (in case SeaORM created the tables without them)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allowed_mimes_mime_type_key') THEN
        ALTER TABLE allowed_mimes ADD CONSTRAINT allowed_mimes_mime_type_key UNIQUE (mime_type);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'magic_signatures_signature_mime_type_key') THEN
        ALTER TABLE magic_signatures ADD CONSTRAINT magic_signatures_signature_mime_type_key UNIQUE (signature, mime_type);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blocked_extensions_extension_key') THEN
        ALTER TABLE blocked_extensions ADD CONSTRAINT blocked_extensions_extension_key UNIQUE (extension);
    END IF;
END $$;

-- Seed data for allowed_mimes
INSERT INTO allowed_mimes (mime_type, category) VALUES
('application/pdf', 'Documents'),
('application/msword', 'Documents'),
('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Documents'),
('application/vnd.ms-excel', 'Documents'),
('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Documents'),
('application/vnd.ms-powerpoint', 'Documents'),
('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Documents'),
('application/rtf', 'Documents'),
('text/plain', 'Documents'),
('text/csv', 'Documents'),
('image/jpeg', 'Images'),
('image/png', 'Images'),
('image/gif', 'Images'),
('image/webp', 'Images'),
('image/bmp', 'Images'),
('image/tiff', 'Images'),
('image/svg+xml', 'Images'),
('audio/mpeg', 'Audio'),
('audio/mp3', 'Audio'),
('audio/wav', 'Audio'),
('audio/ogg', 'Audio'),
('audio/flac', 'Audio'),
('audio/aac', 'Audio'),
('audio/webm', 'Audio'),
('audio/mp4', 'Audio'),
('audio/x-m4a', 'Audio'),
('audio/m4a', 'Audio'),
('video/mp4', 'Video'),
('video/mpeg', 'Video'),
('video/webm', 'Video'),
('video/ogg', 'Video'),
('video/quicktime', 'Video'),
('video/x-msvideo', 'Video'),
('application/zip', 'Archives'),
('application/x-rar-compressed', 'Archives'),
('application/vnd.rar', 'Archives'),
('application/x-7z-compressed', 'Archives'),
('application/gzip', 'Archives'),
('application/x-tar', 'Archives'),
('application/x-bzip2', 'Archives'),
('application/x-zip-compressed', 'Archives'),
('application/x-compress', 'Archives'),
('application/x-compressed', 'Archives'),
('application/x-zip', 'Archives'),
('application/x-rar', 'Archives'),
('application/octet-stream', 'Archives'),
('application/x-gtar', 'Archives'),
('application/x-tgz', 'Archives'),
('application/x-gzip', 'Archives'),
('video/mp2t', 'Video')
ON CONFLICT (mime_type) DO NOTHING;

-- Seed data for magic_signatures
INSERT INTO magic_signatures (signature, mime_type) VALUES
('\x25504446', 'application/pdf'),
('\xD0CF11E0', 'application/msword'),
('\x504B0304', 'application/zip'),
('\xFFD8FF', 'image/jpeg'),
('\x89504E47', 'image/png'),
('\x47494638', 'image/gif'),
('\x52494646', 'image/webp'),
('\x424D', 'image/bmp'),
('\x494433', 'audio/mpeg'),
('\xFFFB', 'audio/mpeg'),
('\xFFFA', 'audio/mpeg'),
('\x4F676753', 'audio/ogg'),
('\x664C6143', 'audio/flac'),
('\x00000018667479704D3441', 'audio/mp4'),
('\x0000001C667479704D3441', 'audio/mp4'),
('\x00000020667479704D3441', 'audio/mp4'),
('\x0000001C66747970', 'video/mp4'),
('\x0000002066747970', 'video/mp4'),
('\x47', 'video/mp2t'),
('\x1F8B', 'application/gzip'),
('\x52617221', 'application/vnd.rar'),
('\x377ABCAF', 'application/x-7z-compressed')
ON CONFLICT (signature, mime_type) DO NOTHING;

-- Seed data for blocked_extensions
INSERT INTO blocked_extensions (extension) VALUES
('exe'), ('dll'), ('so'), ('dylib'), ('bin'), ('com'), ('bat'), ('cmd'), ('ps1'), ('sh'), ('bash'),
('js'), ('ts'), ('jsx'), ('tsx'), ('py'), ('pyw'), ('rb'), ('php'), ('pl'), ('cgi'), ('asp'), ('aspx'), ('jsp'), ('jspx'),
('cfm'), ('go'), ('rs'), ('java'), ('class'), ('jar'), ('war'), ('c'), ('cpp'), ('h'), ('hpp'), ('cs'), ('vb'), ('vbs'),
('lua'), ('r'), ('swift'), ('kt'), ('scala'), ('groovy'), ('html'), ('htm'), ('xhtml'), ('shtml'), ('svg'), ('xml'), ('xsl'), ('xslt'),
('htaccess'), ('htpasswd'), ('json'), ('yaml'), ('yml'), ('toml'), ('ini'), ('conf'), ('config'),
('iso'), ('img'), ('vmdk'), ('vhd'), ('ova'), ('ovf'),
('docm'), ('xlsm'), ('pptm'), ('dotm'), ('xltm'), ('potm')
ON CONFLICT (extension) DO NOTHING;

-- Note: SERIAL and BYTEA are PostgreSQL specific. 
-- For SQLite compatibility, you might need to adjust.
-- Since the logs show postgres:// URL, we'll stick to Postgres syntax.
