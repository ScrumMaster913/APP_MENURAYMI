<?php
declare(strict_types=1);

/**
 * Persistencia normalizada del menú (un restaurante) + lectura al formato menu.json.
 */

function menu_repository_save(PDO $pdo, array $out): void
{
    $pdo->beginTransaction();
    try {
        $pdo->exec('DELETE FROM product_modifier_links');
        $pdo->exec('DELETE FROM product_variants');
        $pdo->exec(
            'DELETE mo FROM modifier_options mo INNER JOIN modifier_groups mg ON mg.id = mo.group_id WHERE mg.product_id IS NOT NULL'
        );
        $pdo->exec('DELETE FROM modifier_groups WHERE product_id IS NOT NULL');
        $pdo->exec('DELETE FROM products');
        $pdo->exec('DELETE FROM categories');
        $pdo->exec(
            'DELETE mo FROM modifier_options mo INNER JOIN modifier_groups mg ON mg.id = mo.group_id WHERE mg.product_id IS NULL'
        );
        $pdo->exec('DELETE FROM modifier_groups WHERE product_id IS NULL');

        $ru = $pdo->prepare('UPDATE restaurant SET currency_symbol = ?, logo_url = ?, updated_at = NOW() WHERE id = 1');
        $ru->execute([$out['currencySymbol'] ?? '$', $out['logoUrl'] ?? '']);

        $insCat = $pdo->prepare('INSERT INTO categories (id, sort_order, name, layout) VALUES (?,?,?,?)');
        $insProd = $pdo->prepare(
            'INSERT INTO products (id, category_id, sort_order, name, description, image_url, sku, kitchen, status, pricing_mode, base_price, discount, cost, packaging, stock_enabled, stock, min_stock) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        );
        $insVar = $pdo->prepare('INSERT INTO product_variants (product_id, sort_order, name, price) VALUES (?,?,?,?)');
        $insGrp = $pdo->prepare(
            'INSERT INTO modifier_groups (id, product_id, library_sort, inline_sort, name, optional, multi_select, min_select, max_select) VALUES (?,?,?,?,?,?,?,?,?)'
        );
        $insOpt = $pdo->prepare(
            'INSERT INTO modifier_options (id, group_id, sort_order, name, price, max_qty, cost, discount, sku, status) VALUES (?,?,?,?,?,?,?,?,?,?)'
        );
        $insLink = $pdo->prepare('INSERT INTO product_modifier_links (product_id, modifier_group_id, sort_order) VALUES (?,?,?)');

        foreach ($out['categories'] ?? [] as $ci => $cat) {
            $layout = (isset($cat['layout']) && $cat['layout'] === 'row') ? 'row' : null;
            $insCat->execute([$cat['id'], $ci, $cat['name'], $layout]);
        }

        foreach ($out['modifierLibrary'] ?? [] as $gi => $g) {
            $insGrp->execute([
                $g['id'],
                null,
                $gi,
                null,
                $g['name'],
                !empty($g['optional']) ? 1 : 0,
                array_key_exists('multiSelect', $g) ? ($g['multiSelect'] ? 1 : 0) : 1,
                (int) ($g['minSelect'] ?? 0),
                (int) ($g['maxSelect'] ?? 0),
            ]);
            foreach ($g['options'] ?? [] as $oi => $o) {
                $insOpt->execute([
                    $o['id'],
                    $g['id'],
                    $oi,
                    $o['name'],
                    (int) ($o['price'] ?? 0),
                    (int) ($o['maxQty'] ?? 99),
                    $o['cost'] ?? null,
                    $o['discount'] ?? null,
                    $o['sku'] ?? null,
                    isset($o['status']) && $o['status'] === 'hidden' ? 'hidden' : null,
                ]);
            }
        }

        foreach ($out['categories'] ?? [] as $ci => $cat) {
            foreach ($cat['products'] ?? [] as $pi => $p) {
                $pid = $p['id'];
                $pricingMode = isset($p['pricingMode']) && $p['pricingMode'] === 'variants' ? 'variants' : null;
                $status = isset($p['status']) && $p['status'] === 'hidden' ? 'hidden' : 'available';
                $stockEn = !empty($p['stockEnabled']) ? 1 : 0;
                $stock = isset($p['stock']) ? (int) $p['stock'] : null;
                $minStock = isset($p['minStock']) ? (int) $p['minStock'] : null;
                $insProd->execute([
                    $pid,
                    $cat['id'],
                    $pi,
                    $p['name'],
                    $p['description'] ?? null,
                    $p['imageUrl'] ?? null,
                    $p['sku'] ?? null,
                    $p['kitchen'] ?? null,
                    $status,
                    $pricingMode,
                    (int) ($p['price'] ?? 0),
                    $p['discount'] ?? null,
                    $p['cost'] ?? null,
                    $p['packaging'] ?? null,
                    $stockEn,
                    $stockEn ? $stock : null,
                    $stockEn ? $minStock : null,
                ]);

                if ($pricingMode === 'variants' && !empty($p['variants']) && is_array($p['variants'])) {
                    foreach ($p['variants'] as $vi => $v) {
                        $insVar->execute([$pid, $vi, $v['name'], (int) ($v['price'] ?? 0)]);
                    }
                }

                if (!empty($p['modifiers']) && is_array($p['modifiers'])) {
                    foreach ($p['modifiers'] as $gi => $g) {
                        $insGrp->execute([
                            $g['id'],
                            $pid,
                            null,
                            $gi,
                            $g['name'],
                            !empty($g['optional']) ? 1 : 0,
                            array_key_exists('multiSelect', $g) ? ($g['multiSelect'] ? 1 : 0) : 1,
                            (int) ($g['minSelect'] ?? 0),
                            (int) ($g['maxSelect'] ?? 0),
                        ]);
                        foreach ($g['options'] ?? [] as $oi => $o) {
                            $insOpt->execute([
                                $o['id'],
                                $g['id'],
                                $oi,
                                $o['name'],
                                (int) ($o['price'] ?? 0),
                                (int) ($o['maxQty'] ?? 99),
                                $o['cost'] ?? null,
                                $o['discount'] ?? null,
                                $o['sku'] ?? null,
                                isset($o['status']) && $o['status'] === 'hidden' ? 'hidden' : null,
                            ]);
                        }
                    }
                }

                if (!empty($p['modifierIds']) && is_array($p['modifierIds'])) {
                    foreach ($p['modifierIds'] as $li => $mid) {
                        $insLink->execute([$pid, $mid, $li]);
                    }
                }
            }
        }

        $payUp = $pdo->prepare('UPDATE checkout_payment_methods SET label = ?, enabled = ?, instructions = ? WHERE slug = ?');
        foreach ($out['checkoutPayment']['methods'] ?? [] as $m) {
            $payUp->execute([
                $m['label'],
                !empty($m['enabled']) ? 1 : 0,
                $m['instructions'] ?? '',
                $m['id'],
            ]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * @return array<string, mixed>
 */
function menu_repository_load(PDO $pdo): array
{
    $row = $pdo->query('SELECT currency_symbol, logo_url FROM restaurant WHERE id = 1')->fetch(PDO::FETCH_ASSOC);
    $currencySymbol = is_array($row) && isset($row['currency_symbol']) ? (string) $row['currency_symbol'] : '$';
    $logoUrl = is_array($row) && isset($row['logo_url']) ? (string) $row['logo_url'] : '';

    $methods = [];
    $mq = $pdo->query('SELECT slug, label, enabled, instructions FROM checkout_payment_methods ORDER BY sort_order ASC, slug ASC');
    foreach ($mq as $m) {
        $methods[] = [
            'id' => $m['slug'],
            'label' => $m['label'],
            'enabled' => (bool) (int) $m['enabled'],
            'instructions' => (string) ($m['instructions'] ?? ''),
        ];
    }

    $modifierLibrary = [];
    $gq = $pdo->query('SELECT * FROM modifier_groups WHERE product_id IS NULL ORDER BY library_sort ASC, id ASC');
    foreach ($gq as $g) {
        $modifierLibrary[] = menu_repo_build_group_array($pdo, $g);
    }

    $categories = [];
    $cq = $pdo->query('SELECT * FROM categories ORDER BY sort_order ASC, id ASC');
    foreach ($cq as $cat) {
        $catOut = [
            'id' => $cat['id'],
            'name' => $cat['name'],
            'products' => [],
        ];
        if (($cat['layout'] ?? '') === 'row') {
            $catOut['layout'] = 'row';
        }
        $pq = $pdo->prepare('SELECT * FROM products WHERE category_id = ? ORDER BY sort_order ASC, id ASC');
        $pq->execute([$cat['id']]);
        foreach ($pq as $p) {
            $catOut['products'][] = menu_repo_build_product_array($pdo, $p);
        }
        $categories[] = $catOut;
    }

    return [
        'logoUrl' => $logoUrl,
        'currencySymbol' => $currencySymbol,
        'checkoutPayment' => ['methods' => $methods],
        'categories' => $categories,
        'modifierLibrary' => $modifierLibrary,
    ];
}

/**
 * @param array<string,mixed> $g
 * @return array<string,mixed>
 */
function menu_repo_build_group_array(PDO $pdo, array $g): array
{
    $gid = $g['id'];
    $out = [
        'id' => $gid,
        'name' => $g['name'],
        'optional' => (bool) (int) $g['optional'],
        'multiSelect' => (bool) (int) $g['multi_select'],
        'minSelect' => (int) $g['min_select'],
        'maxSelect' => (int) $g['max_select'],
        'options' => [],
    ];
    $oq = $pdo->prepare('SELECT * FROM modifier_options WHERE group_id = ? ORDER BY sort_order ASC, id ASC');
    $oq->execute([$gid]);
    foreach ($oq as $o) {
        $opt = [
            'id' => $o['id'],
            'name' => $o['name'],
            'price' => (int) $o['price'],
            'maxQty' => (int) $o['max_qty'],
        ];
        if ($o['cost'] !== null && $o['cost'] !== '') {
            $opt['cost'] = (float) $o['cost'];
        }
        if ($o['discount'] !== null && $o['discount'] !== '') {
            $opt['discount'] = (float) $o['discount'];
        }
        if (!empty($o['sku'])) {
            $opt['sku'] = $o['sku'];
        }
        if (($o['status'] ?? '') === 'hidden') {
            $opt['status'] = 'hidden';
        }
        $out['options'][] = $opt;
    }

    return $out;
}

/**
 * @param array<string,mixed> $p
 * @return array<string,mixed>
 */
function menu_repo_build_product_array(PDO $pdo, array $p): array
{
    $pid = $p['id'];
    $prod = [
        'id' => $pid,
        'name' => $p['name'],
        'price' => (int) $p['base_price'],
    ];
    if (!empty($p['description'])) {
        $prod['description'] = $p['description'];
    }
    if (!empty($p['image_url'])) {
        $prod['imageUrl'] = $p['image_url'];
    }
    if (!empty($p['sku'])) {
        $prod['sku'] = $p['sku'];
    }
    if (!empty($p['kitchen'])) {
        $prod['kitchen'] = $p['kitchen'];
    }
    if (($p['status'] ?? '') === 'hidden') {
        $prod['status'] = 'hidden';
    }
    if (($p['pricing_mode'] ?? '') === 'variants') {
        $prod['pricingMode'] = 'variants';
        $vars = [];
        $vq = $pdo->prepare('SELECT name, price FROM product_variants WHERE product_id = ? ORDER BY sort_order ASC, id ASC');
        $vq->execute([$pid]);
        foreach ($vq as $v) {
            $vars[] = ['name' => $v['name'], 'price' => (int) $v['price']];
        }
        $prod['variants'] = $vars;
    }
    foreach (['discount', 'cost', 'packaging'] as $k) {
        if ($p[$k] !== null && $p[$k] !== '') {
            $prod[$k] = (float) $p[$k];
        }
    }
    if (!empty($p['stock_enabled'])) {
        $prod['stockEnabled'] = true;
        $prod['stock'] = (int) ($p['stock'] ?? 0);
        $prod['minStock'] = (int) ($p['min_stock'] ?? 0);
    }

    $lq = $pdo->prepare('SELECT modifier_group_id FROM product_modifier_links WHERE product_id = ? ORDER BY sort_order ASC');
    $lq->execute([$pid]);
    $ids = [];
    foreach ($lq as $r) {
        $ids[] = $r['modifier_group_id'];
    }
    if ($ids !== []) {
        $prod['modifierIds'] = $ids;
    }

    $iq = $pdo->prepare('SELECT * FROM modifier_groups WHERE product_id = ? ORDER BY inline_sort ASC, id ASC');
    $iq->execute([$pid]);
    $inline = [];
    foreach ($iq as $g) {
        $inline[] = menu_repo_build_group_array($pdo, $g);
    }
    if ($inline !== []) {
        $prod['modifiers'] = $inline;
    }

    return $prod;
}
