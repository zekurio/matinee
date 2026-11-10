package io.github.zekurio.matinee.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.StructureKind
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Reading models the app saved itself, like the downloads list, which an
 * older app may have written under an older contract. A field the contract
 * gained since is missing there, and the generated classes require it, so
 * a strict read would lose the whole save. This one fills such a field
 * with an empty value instead: false, 0, "", or an empty list or object.
 */

/** [text] as [serializer] reads it, with fields a newer contract added filled in. */
fun <T> decodeSaved(serializer: KSerializer<T>, text: String): T =
    decodeSaved(serializer, MatineeJson.parseToJsonElement(text))

fun <T> decodeSaved(serializer: KSerializer<T>, element: JsonElement): T = try {
    MatineeJson.decodeFromJsonElement(serializer, element)
} catch (_: SerializationException) {
    MatineeJson.decodeFromJsonElement(serializer, filled(element, serializer.descriptor))
}

@OptIn(ExperimentalSerializationApi::class)
private fun filled(element: JsonElement, descriptor: SerialDescriptor): JsonElement {
    if (element is JsonNull) return element
    return when (descriptor.kind) {
        StructureKind.CLASS -> {
            val fields = element as? JsonObject ?: return element
            val result = fields.toMutableMap()
            for (index in 0 until descriptor.elementsCount) {
                val name = descriptor.getElementName(index)
                val field = descriptor.getElementDescriptor(index)
                val present = fields[name]
                when {
                    present != null -> result[name] = filled(present, field)
                    // Left at its default, or read as null.
                    descriptor.isElementOptional(index) || field.isNullable -> Unit
                    else -> empty(field)?.let { result[name] = it }
                }
            }
            JsonObject(result)
        }
        StructureKind.LIST -> {
            val items = element as? JsonArray ?: return element
            JsonArray(items.map { filled(it, descriptor.getElementDescriptor(0)) })
        }
        StructureKind.MAP -> {
            val entries = element as? JsonObject ?: return element
            JsonObject(entries.mapValues { (_, value) -> filled(value, descriptor.getElementDescriptor(1)) })
        }
        // A union's variant names itself with its tag, which a save always has.
        else -> element
    }
}

@OptIn(ExperimentalSerializationApi::class)
private fun empty(descriptor: SerialDescriptor): JsonElement? = when (descriptor.kind) {
    PrimitiveKind.BOOLEAN -> JsonPrimitive(false)
    PrimitiveKind.BYTE, PrimitiveKind.SHORT, PrimitiveKind.INT, PrimitiveKind.LONG -> JsonPrimitive(0)
    PrimitiveKind.FLOAT, PrimitiveKind.DOUBLE -> JsonPrimitive(0.0)
    PrimitiveKind.STRING -> JsonPrimitive("")
    StructureKind.LIST -> JsonArray(emptyList())
    StructureKind.MAP -> JsonObject(emptyMap())
    StructureKind.CLASS -> filled(JsonObject(emptyMap()), descriptor)
    // A union has no empty variant to make up.
    else -> null
}
