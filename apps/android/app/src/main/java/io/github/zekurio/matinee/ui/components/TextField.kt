package io.github.zekurio.matinee.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.theme.Palette

/** A text field as the web draws one: sunken, with a quiet border. */
@Composable
fun MatineeTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    @DrawableRes leadingIcon: Int? = null,
    trailing: (@Composable () -> Unit)? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    isError: Boolean = false,
    enabled: Boolean = true,
    visualTransformation: androidx.compose.ui.text.input.VisualTransformation = androidx.compose.ui.text.input.VisualTransformation.None,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        singleLine = true,
        isError = isError,
        textStyle = MaterialTheme.typography.bodyLarge,
        placeholder = placeholder?.let { { Text(it, color = Palette.Faint) } },
        leadingIcon = leadingIcon?.let { { LucideIcon(it, null, size = 18.dp, tint = Palette.Muted) } },
        trailingIcon = trailing,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        visualTransformation = visualTransformation,
        shape = ControlShape,
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = Palette.Sunken,
            unfocusedContainerColor = Palette.Sunken,
            disabledContainerColor = Palette.Sunken,
            focusedBorderColor = Palette.Accent,
            unfocusedBorderColor = Palette.Input,
            errorBorderColor = Palette.Danger,
            cursorColor = Palette.Accent,
        ),
    )
}
