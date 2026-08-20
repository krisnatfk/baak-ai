UPDATE "bot_message_rules"
SET
	"reply" = CASE "normalized_phrase"
		WHEN 'permisi' THEN 'Silakan Kak 👋'
		WHEN 'selamat pagi' THEN 'Selamat pagi Kak 👋'
		WHEN 'selamat siang' THEN 'Selamat siang Kak 👋'
		WHEN 'selamat sore' THEN 'Selamat sore Kak 👋'
		WHEN 'selamat malam' THEN 'Selamat malam Kak 👋'
	END,
	"updated_at" = now()
WHERE
	"type" = 'GREETING'
	AND ("reply" IS NULL OR btrim("reply") = '')
	AND "normalized_phrase" IN (
		'permisi',
		'selamat pagi',
		'selamat siang',
		'selamat sore',
		'selamat malam'
	);
