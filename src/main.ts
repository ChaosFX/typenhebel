import { mount } from 'svelte';
import App from './App.svelte';
import { app, TEXT_SCALE } from './app/state.svelte';

// Farbschema vor dem ersten Zeichnen setzen (gegen Flackern)
document.documentElement.dataset.theme = app.settings.theme;
document.documentElement.dataset.caret = app.settings.caret;
document.documentElement.style.setProperty('--fs-scale', String(TEXT_SCALE[app.settings.textSize]));
mount(App, { target: document.body });
void app.start();
