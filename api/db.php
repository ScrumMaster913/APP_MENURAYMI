<?php
declare(strict_types=1);

/**
 * Conexión PDO opcional. Si no existe api/config.database.php, la app sigue usando data/menu.json.
 */
function olc_db_configured(): bool
{
    return is_file(__DIR__ . DIRECTORY_SEPARATOR . 'config.database.php');
}

function olc_pdo(): ?PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    if (!olc_db_configured()) {
        return null;
    }
    /** @var array{dsn:string,user:string,pass:string,options?:array<int,mixed>} $cfg */
    $cfg = require __DIR__ . DIRECTORY_SEPARATOR . 'config.database.php';
    try {
        $pdo = new PDO($cfg['dsn'], $cfg['user'], $cfg['pass'], $cfg['options'] ?? []);
    } catch (Throwable $e) {
        return null;
    }

    return $pdo;
}
