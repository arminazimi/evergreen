const Boom = require("@hapi/boom");
const cryptiles = require('@hapi/cryptiles');
const Sntp = require("@hapi/sntp");
import Router from "@koa/router";
import type { Config } from "koa-router/types";
import { decode } from '@jridgewell/sourcemap-codec';
const lazy = () => import("@hapi/boom");
const notes = "boom is a word";
