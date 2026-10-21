// Vue 2 applications used: import Vue from "vue" and new Vue({ el: "#app" })
import { createApp } from "vue";
import { createRouter } from "vue-router";
import App from "./App.vue";

const notes = 'require("@vue/compat") is only for the migration build';
console.log(notes);
createApp(App).use(createRouter({ routes: [] }));
