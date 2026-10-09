// ЗАГОТОВКА страницы превью (будет написана полностью).
import { render } from 'preact';
import '../ui/fonts.css';
import '../ui/tokens.css';
import '../ui/base.css';
import { initSettings } from '../state/settings';

initSettings('ucheba.preview.settings');
render(<p style="padding:24px">Превью скоро</p>, document.getElementById('app')!);
