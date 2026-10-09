// Заглушка для экранов, которые появятся на следующих этапах.

export function SoonScreen({ title, text }: { title: string; text: string }) {
  return (
    <section class="screen">
      <h1>{title}</h1>
      <p class="empty">{text}</p>
    </section>
  );
}
