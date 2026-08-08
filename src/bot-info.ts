// Contenedor mutable para el username del bot, rellenado en el arranque.
export const botUsername = {
  value: '',
  get(): string {
    return this.value;
  },
  set(name: string): void {
    this.value = name;
  },
};
