using BDoc.Domain.Entities;
using BDoc.Domain.Interfaces;

namespace BDoc.Services;

/// <summary>
/// Single place deciding document access so the REST controller and the
/// SignalR hub can never disagree. Levels: "owner" | "editor" | "viewer" | null.
/// </summary>
public static class DocumentAccess
{
    public static async Task<string?> LevelAsync(IDocumentRepository repository, Document doc, Guid? uid)
    {
        if (uid is null) return null;
        if (doc.OwnerId == uid) return "owner";
        var share = await repository.GetShareAsync(doc.Id, uid.Value);
        return share?.Permission;
    }
}
