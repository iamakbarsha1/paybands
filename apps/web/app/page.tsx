import { redirect } from 'next/navigation';

/** There is no landing page to write: the product opens on the people it is about. */
export default function HomePage() {
  redirect('/employees');
}
