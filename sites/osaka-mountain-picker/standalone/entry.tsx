import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import MountainPickerApp from '../app/mountain-picker-app';

declare const __MOUNTAIN_PUBLIC_BASE_PATH__: string;
declare const __MOUNTAIN_WEATHER_ENDPOINT__: string;

const root = document.getElementById('root');

if (!root) throw new Error('Missing application root');

createRoot(root).render(
  <StrictMode>
    <MountainPickerApp
      displayName=""
      deploymentMode="protected"
      basePath={__MOUNTAIN_PUBLIC_BASE_PATH__}
      weatherEndpoint={__MOUNTAIN_WEATHER_ENDPOINT__}
    />
  </StrictMode>,
);
