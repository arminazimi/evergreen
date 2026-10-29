<?php

use Swift_Mailer;

require 'Swift_Mailer.php';

$mailer = new Swift_Mailer($transport);
$mailer->send(Swift_Mailer::newInstance($transport));
