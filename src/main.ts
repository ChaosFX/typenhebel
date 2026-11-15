import { mount } from 'svelte';
import App from './App.svelte';
import { app } from './app/state.svelte';

// Farbschema vor dem ersten Zeichnen setzen (gegen Flackern)
document.documentElement.dataset.theme = app.settings.theme;
mount(App, { target: document.body });
void app.start();
