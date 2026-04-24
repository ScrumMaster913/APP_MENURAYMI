<?php
/**
 * Copia este archivo como config.database.php y completa los datos de Hostinger (hPanel → Bases de datos MySQL).
 * No subas config.database.php a repositorios públicos si contiene contraseña.
 */
return [
    'dsn' => 'mysql:host=localhost;dbname=TU_BASE;charset=utf8mb4',
    'user' => 'TU_USUARIO_MYSQL',
    'pass' => 'TU_CONTRASEÑA',
    'options' => [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ],
];
