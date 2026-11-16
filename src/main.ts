import { mount } from 'svelte';
import App from './App.svelte';
import { app } from './app/state.svelte';

// Farbschema vor dem ersten Zeichnen setzen (gegen Flackern)
document.documentElement.dataset.theme = app.settings.theme;
document.documentElement.dataset.caret = app.settings.caret;
mount(App, { target: document.body });
void app.start();
