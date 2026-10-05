import { render } from 'preact';
import { App } from './ui/App.tsx';
import './ui/styles.css?v=3'; // ?v=: đổi URL để điện thoại bỏ bản CSS cũ Cloudflare đã cho cache

render(<App />, document.getElementById('ui')!);

// chặn zoom bằng 2 ngón / double-tap trên iOS
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
