import { render } from 'preact';
import { App } from './app';
import { setupPwa } from './pwa';
import './styles.css';

render(<App />, document.getElementById('app')!);
setupPwa();
