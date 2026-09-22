using System.Collections.Concurrent;
using System.Security.Claims;
using BDoc.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace BDoc.Hubs;

/// <summary>
/// Phase-A collaboration: presence (who is viewing) + live cursor relay.
/// No document content flows here — saves still go through the REST API.
/// Presence is in-memory; a multi-instance deploy would need a Redis backplane.
/// </summary>
[Authorize]
public class CollabHub : Hub
{
    public sealed record PresenceInfo(string UserId, string Email);
    public sealed record CursorUpdate(string UserId, string Email, int From, int To);

    private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, PresenceInfo>> DocPresence = new();

    private readonly IDocumentRepository _repository;

    public CollabHub(IDocumentRepository repository)
    {
        _repository = repository;
    }

    private string? CurrentUserId()
    {
        var user = Context.User;
        var val = user?.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user?.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub);
        return Guid.TryParse(val, out _) ? val : null;
    }

    private static string CurrentEmail(ClaimsPrincipal? user) =>
        user?.FindFirstValue(ClaimTypes.Email)
        ?? user?.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Email)
        ?? "?";

    private async Task<bool> CanReadAsync(Guid docId, string? uid)
    {
        if (uid is null || !Guid.TryParse(uid, out var userId)) return false;
        BDoc.Domain.Entities.Document doc;
        try
        {
            doc = await _repository.GetByIdAsync(docId);
        }
        catch
        {
            return false;
        }
        return await BDoc.Services.DocumentAccess.LevelAsync(_repository, doc, userId) is not null;
    }

    private async Task<bool> CanWriteAsync(Guid docId, string? uid)
    {
        if (uid is null || !Guid.TryParse(uid, out var userId)) return false;
        BDoc.Domain.Entities.Document doc;
        try
        {
            doc = await _repository.GetByIdAsync(docId);
        }
        catch
        {
            return false;
        }
        return await BDoc.Services.DocumentAccess.LevelAsync(_repository, doc, userId) is ("owner" or "editor");
    }

    public async Task JoinDocument(string docIdStr)
    {
        if (!Guid.TryParse(docIdStr, out var docId)) throw new HubException("Invalid document id");
        var uid = CurrentUserId();
        if (!await CanReadAsync(docId, uid)) throw new HubException("Forbidden");
        var members = DocPresence.GetOrAdd(docIdStr, _ => new ConcurrentDictionary<string, PresenceInfo>());
        members[Context.ConnectionId] = new PresenceInfo(uid!, CurrentEmail(Context.User));
        await Groups.AddToGroupAsync(Context.ConnectionId, docIdStr);
        await BroadcastPresenceAsync(docIdStr, members);
    }

    public async Task LeaveDocument(string docIdStr)
    {
        if (DocPresence.TryGetValue(docIdStr, out var members) && members.TryRemove(Context.ConnectionId, out _))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, docIdStr);
            await BroadcastPresenceAsync(docIdStr, members);
        }
    }

    public async Task SendCursor(string docIdStr, int from, int to)
    {
        if (!Guid.TryParse(docIdStr, out var docId)) throw new HubException("Invalid document id");
        var uid = CurrentUserId();
        if (!await CanReadAsync(docId, uid)) throw new HubException("Forbidden");
        var msg = new CursorUpdate(uid!, CurrentEmail(Context.User), Math.Max(0, from), Math.Max(0, to));
        await Clients.OthersInGroup(docIdStr).SendAsync("CursorMoved", msg);
    }

    public sealed record ContentUpdated(string DocumentId, DateTime UpdatedAt, string ByEmail);

    /// <summary>
    /// Called by a client right after its save persisted. Viewers must not
    /// be able to spoof update notifications, hence the write check.
    /// </summary>
    public async Task NotifySaved(string docIdStr)
    {
        if (!Guid.TryParse(docIdStr, out var docId)) throw new HubException("Invalid document id");
        var uid = CurrentUserId();
        if (!await CanWriteAsync(docId, uid)) throw new HubException("Forbidden");
        BDoc.Domain.Entities.Document doc;
        try
        {
            doc = await _repository.GetByIdAsync(docId);
        }
        catch
        {
            throw new HubException("Not found");
        }
        await Clients.OthersInGroup(docIdStr).SendAsync(
            "ContentUpdated", new ContentUpdated(docIdStr, doc.UpdatedAt, CurrentEmail(Context.User)));
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        foreach (var (docId, members) in DocPresence)
        {
            if (members.TryRemove(Context.ConnectionId, out _))
                await BroadcastPresenceAsync(docId, members);
        }
        await base.OnDisconnectedAsync(exception);
    }

    private async Task BroadcastPresenceAsync(string docIdStr, ConcurrentDictionary<string, PresenceInfo> members)
    {
        var list = members.Values.DistinctBy(m => m.UserId).OrderBy(m => m.Email).ToList();
        await Clients.Group(docIdStr).SendAsync("PresenceUpdated", list);
    }
}
