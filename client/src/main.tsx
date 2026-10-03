import { render } from 'preact';
import { App } from './ui/App.tsx';
import './ui/styles.css';

render(<App />, document.getElementById('ui')!);

// chặn zoom bằng 2 ngón / double-tap trên iOS
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
