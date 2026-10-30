# Composer upgrade example

`acme/http-client` is locked at `2.1.0`, and its `require.php` constraint is `^7.4`. The project itself only requires `^8.1`.

```bash
evergreen upgrade-check --to php@8.4 examples/upgrade/composer-lock
```

```text
php@8.4: blocked (1 blockers, 0 warnings, 0 unknown)
composer.lock:9  acme/http-client@2.1.0  acme/http-client@2.1.0 requires php ^7.4, which excludes PHP 8.4.  [lockfile: require.php: ^7.4]
```

The exit code is `1` when the verdict is `blocked`. Nothing is installed, executed, or fetched: the answer comes from the committed `composer.lock` and `composer.json`.
