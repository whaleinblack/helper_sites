import { requireChatGPTUser } from './chatgpt-auth';
import MountainPickerApp from './mountain-picker-app';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireChatGPTUser('/');
  return <MountainPickerApp displayName={user.displayName} />;
}
