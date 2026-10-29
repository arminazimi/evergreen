<?php

$path = __DIR__ . '/Swift_Mailer.php';
require $path;

include $this->file();

$class = 'Swift_Mailer';
$mailer = new $class($transport);
$class::newInstance($transport);

$directory = dirname(__FILE__);
require $directory . '/Swift_Mailer.php';
