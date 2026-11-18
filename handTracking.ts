import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// Files in /public are served from the site root, so these load from your own dev server.
const BASE = import.meta.env.BASE_URL;
const WASM_PATH = `${BASE}mediapipe/wasm`;
const MODELS = `${BASE}models`;

// The MediaPipe engine is loaded once and shared by the hand and face models.
let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
const getFileset = () => (filesetPromise ??= FilesetResolver.forVisionTasks(WASM_PATH));

/** Tries the GPU first because it's faster, and falls back to the CPU where the GPU isn't available. */
async function withGpuFallback<T>(name: string, create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try {
    return await create('GPU');
  } catch (err) {
    console.warn(`GPU ${name} tracking unavailable, falling back to CPU.`, err);
    return await create('CPU');
  }
}

/** Google's MediaPipe hand model: finds 21 points on each of up to two hands. */
export async function createHandLandmarker(): Promise<HandLandmarker> {
  const fileset = await getFileset();
  return withGpuFallback('hand', (delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${MODELS}/hand_landmarker.task`, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
  );
}

/** Face model: finds 478 points on your face (used to place the hat). */
export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const fileset = await getFileset();
  return withGpuFallback('face', (delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${MODELS}/face_landmarker.task`, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
    }),
  );
}

/** Asks the browser for the webcam and starts playing it into the <video> element. */
export async function startCamera(video: HTMLVideoElement): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser can’t access a camera. Try a recent Chrome, Edge, Firefox or Safari.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    const name = (err as DOMException).name;
    if (name === 'NotAllowedError') throw new Error('Camera access was blocked. Allow it in the address bar, then try again.');
    if (name === 'NotFoundError') throw new Error('No camera was found on this device.');
    if (name === 'NotReadableError') throw new Error('The camera is busy. Close other apps that are using it and try again.');
    throw err;
  }
  video.srcObject = stream;
  if (video.readyState < 1) {
    await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
  }
  await video.play();
}
