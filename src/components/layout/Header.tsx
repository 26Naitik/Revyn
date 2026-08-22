export function Header({ title }: { title: string }) {
  return (
    <header className="flex h-16 items-center border-b border-gray-200 bg-white px-6">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    </header>
  );
}
