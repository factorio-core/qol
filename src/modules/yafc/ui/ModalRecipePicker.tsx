import { createElement } from 'fcore/react';
import { ModalResourcePicker, ModalResourcePickerProps } from './ModalResourcePicker';

export type ModalRecipePickerProps = ModalResourcePickerProps;

/** Recipe picker modal preconfigured in recipe selection mode. */
export function ModalRecipePicker(props: ModalRecipePickerProps) {
  return <ModalResourcePicker mode="recipe" {...props} />;
}
