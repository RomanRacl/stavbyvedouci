import { redirect } from 'next/navigation';

/** Hlavní adresa zatím přesměruje na dashboard majitele (později sem přijde přihlášení). */
export default function Home() {
  redirect('/dashboard');
}
