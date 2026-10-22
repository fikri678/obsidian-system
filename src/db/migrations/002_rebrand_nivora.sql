-- Penjenamaan semula: Obsidian Tech -> NIVORA
-- Selamat dijalankan pada pangkalan data kosong (no-op sebelum seed).

UPDATE settings
SET value = replace(value, 'Obsidian Tech', 'NIVORA')
WHERE key = 'platformName';

UPDATE users
SET email = replace(email, '@obsidian.tech', '@nivora.my')
WHERE email LIKE '%@obsidian.tech';

UPDATE users
SET name = replace(name, 'Obsidian', 'NIVORA')
WHERE name LIKE '%Obsidian%';
