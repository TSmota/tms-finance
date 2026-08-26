import { Badge } from "@mantine/core";

import { DEFAULT_CATEGORY_COLOR } from "@/lib/currency";

interface CategoryBadgeProps {
  name: string;
  /** Hex escolhido pelo usuário no `ColorInput`; `null` cai no padrão. */
  color: string | null;
  size?: string;
  mt?: string;
}

/**
 * Badge de categoria — fonte única da regra de contraste para cor de usuário.
 *
 * `filled` entrega a escolha do rótulo ao `autoContrast` do tema. Com `light`,
 * o Mantine pinta o texto com a própria cor sobre um fundo tingido dela: 2.17:1
 * num verde comum, e sem tom seguro possível para um hex desconhecido.
 */
export function CategoryBadge(props: CategoryBadgeProps) {
  const { name, color, size, mt } = props;

  return (
    <Badge color={color ?? DEFAULT_CATEGORY_COLOR} variant="filled" size={size} mt={mt}>
      {name}
    </Badge>
  );
}
