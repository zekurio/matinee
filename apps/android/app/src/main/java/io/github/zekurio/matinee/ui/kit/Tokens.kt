package io.github.zekurio.matinee.ui.kit

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/*
 * The kit: what every screen is built from, drawn as packages/ui draws it,
 * so the app looks like the web app and not like Material. Screens use these
 * and the colors in Palette; only the kit reaches into material3, and
 * KitBoundaryTest holds that.
 */

/**
 * The web's radius scale: globals.css sets `--radius` to 0.625rem and steps
 * the others from it. A shape outside these is a shape the web doesn't draw.
 */
object Radius {
    /** `rounded-sm`: small boxes inside a card, like a badge. */
    val Sm = 6.dp

    /** `rounded-md`: a menu's rows, a card's picture. */
    val Md = 8.dp

    /** `rounded-lg`: buttons and inputs. */
    val Lg = 10.dp

    /** `rounded-xl`: dialogs, menus, toasts, the top of a sheet. */
    val Xl = 14.dp

    /** `rounded-2xl`: large panels. */
    val Xxl = 18.dp
}

object Shapes {
    val Sm = RoundedCornerShape(Radius.Sm)
    val Md = RoundedCornerShape(Radius.Md)
    val Lg = RoundedCornerShape(Radius.Lg)
    val Xl = RoundedCornerShape(Radius.Xl)
    val Xxl = RoundedCornerShape(Radius.Xxl)

    /** A sheet's: round at the top, square where it meets the screen's edge. */
    val Sheet = RoundedCornerShape(topStart = Radius.Xl, topEnd = Radius.Xl)
}

/** Buttons and inputs. */
val ControlShape = Shapes.Lg

/** Posters, stills, and the cards that hold them. */
val CardShape = Shapes.Sm

/** The page gutter on phones. */
val Gutter = 16.dp

/** Tall enough for a finger, as the web's `[@media(pointer:coarse)]:h-11`. */
val TouchHeight = 44.dp

@Composable
fun Gap(size: Dp) = Spacer(Modifier.size(size))
