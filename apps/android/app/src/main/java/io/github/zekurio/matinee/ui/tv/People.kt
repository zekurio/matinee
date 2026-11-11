package io.github.zekurio.matinee.ui.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.Credit
import io.github.zekurio.matinee.api.CreditKind
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.initials
import io.github.zekurio.matinee.ui.theme.Palette

/** Someone in a title's cast or crew, for a row of [TvPersonCard]s. */
data class TvPerson(val name: String, val role: String?, val photo: ImageSource?)

/**
 * A title's people as [TvPerson]s, the way its pages list them: the cast
 * with their roles, then the creators, directors, and writers, with
 * [job] naming each one's job, like "Director".
 */
fun tvPeople(api: MatineeApi, credits: List<Credit>, job: (String) -> String): List<TvPerson> {
    val cast = credits.filter { it.kind == CreditKind.ACTOR }.map { TvPerson(it.name, it.role, api.art(it.photo, ArtworkSize.Thumb)) }
    val crew = listOf(CreditKind.CREATOR, CreditKind.DIRECTOR, CreditKind.WRITER).flatMap { kind ->
        credits.filter { it.kind == kind }.distinctBy { it.name }.map { TvPerson(it.name, job(kind), api.art(it.photo, ArtworkSize.Thumb)) }
    }
    return cast + crew
}

/** How wide a [TvPersonCard] is. */
val TvPersonWidth: Dp = 112.dp

/**
 * A person as a round photo, their initials until it loads, with their
 * name and role under it. The photo takes focus; Select runs [onClick].
 */
@Composable
fun TvPersonCard(person: TvPerson, onClick: () -> Unit, modifier: Modifier = Modifier, focus: Modifier = Modifier) {
    val interaction = remember { MutableInteractionSource() }
    Column(modifier.width(TvPersonWidth), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            focus
                .fillMaxWidth()
                .aspectRatio(1f)
                .tvClickable(interaction, role = Role.Button, onClickLabel = person.name, onClick = onClick)
                .tvPicture(interaction, CircleShape)
                .clip(CircleShape)
                .background(Palette.Secondary),
            contentAlignment = Alignment.Center,
        ) {
            Text(initials(person.name), style = TvType.Headline, color = Palette.Muted)
            if (person.photo != null) Picture(listOf(person.photo), Modifier.fillMaxSize())
        }
        Text(
            person.name,
            style = TvType.Label,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 12.dp),
        )
        if (person.role != null) {
            Text(person.role, style = TvType.Caption, color = Palette.Muted, textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
