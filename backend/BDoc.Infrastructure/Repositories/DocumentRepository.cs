using BDoc.Domain.Entities;
using BDoc.Domain.Interfaces;
using BDoc.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BDoc.Infrastructure.Repositories;

public class DocumentRepository : IDocumentRepository
{
    private readonly EditorDbContext _context;

    public DocumentRepository(EditorDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Document>> GetAllAsync() =>
        await _context.Documents.OrderByDescending(d => d.UpdatedAt).ToListAsync();

    public async Task<Document> GetByIdAsync(Guid id) =>
        await _context.Documents.FindAsync(id) ?? throw new Exception("Document not found");

    public async Task CreateAsync(Document document)
    {
        _context.Documents.Add(document);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Document document)
    {
        var existing = await _context.Documents.FindAsync(document.Id);
        if (existing is null) throw new Exception("Document not found");
        if (existing.Content != document.Content || existing.Title != document.Title || existing.Settings != document.Settings)
        {
            _context.DocumentVersions.Add(new DocumentVersion
            {
                DocumentId = existing.Id,
                Title = existing.Title,
                Content = existing.Content,
                Settings = existing.Settings,
                CreatedAt = existing.UpdatedAt,
            });
        }
        existing.Title = document.Title;
        existing.Content = document.Content;
        existing.Settings = document.Settings;
        existing.OwnerId = document.OwnerId;
        existing.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        // Keep only last 50 versions per document.
        var count = await _context.DocumentVersions.CountAsync(v => v.DocumentId == document.Id);
        if (count > 50)
        {
            var toDelete = await _context.DocumentVersions
                .Where(v => v.DocumentId == document.Id)
                .OrderBy(v => v.CreatedAt)
                .Take(count - 50)
                .ToListAsync();
            _context.DocumentVersions.RemoveRange(toDelete);
            await _context.SaveChangesAsync();
        }
    }

    public async Task DeleteAsync(Guid id)
    {
        var doc = await _context.Documents.FindAsync(id);
        if (doc != null)
        {
            var shares = await _context.DocumentShares.Where(s => s.DocumentId == id).ToListAsync();
            _context.DocumentShares.RemoveRange(shares);
            var suggestions = await _context.DocumentSuggestions.Where(s => s.DocumentId == id).ToListAsync();
            _context.DocumentSuggestions.RemoveRange(suggestions);
            _context.Documents.Remove(doc);
            await _context.SaveChangesAsync();
        }
    }

    public async Task<IEnumerable<DocumentVersion>> GetVersionsAsync(Guid documentId) =>
        await _context.DocumentVersions
            .Where(v => v.DocumentId == documentId)
            .OrderByDescending(v => v.CreatedAt)
            .ToListAsync();

    public async Task<DocumentVersion?> GetVersionAsync(Guid documentId, Guid versionId) =>
        await _context.DocumentVersions.FirstOrDefaultAsync(v => v.DocumentId == documentId && v.Id == versionId);

    public async Task<DocumentVersion> CreateVersionAsync(DocumentVersion version)
    {
        _context.DocumentVersions.Add(version);
        await _context.SaveChangesAsync();
        return version;
    }

    public async Task<IEnumerable<DocumentShare>> GetSharesAsync(Guid documentId) =>
        await _context.DocumentShares
            .Where(s => s.DocumentId == documentId)
            .OrderBy(s => s.CreatedAt)
            .ToListAsync();

    public async Task<DocumentShare?> GetShareAsync(Guid documentId, Guid userId) =>
        await _context.DocumentShares
            .FirstOrDefaultAsync(s => s.DocumentId == documentId && s.SharedWithUserId == userId);

    public async Task<HashSet<Guid>> GetSharedDocumentIdsAsync(Guid userId) =>
        (await _context.DocumentShares
            .Where(s => s.SharedWithUserId == userId)
            .Select(s => s.DocumentId)
            .ToListAsync()).ToHashSet();

    public async Task<DocumentShare> UpsertShareAsync(DocumentShare share)
    {
        var existing = await GetShareAsync(share.DocumentId, share.SharedWithUserId);
        if (existing is null)
        {
            _context.DocumentShares.Add(share);
            await _context.SaveChangesAsync();
            return share;
        }
        existing.Permission = share.Permission;
        await _context.SaveChangesAsync();
        return existing;
    }

    public async Task RevokeShareAsync(Guid documentId, Guid userId)
    {
        var existing = await GetShareAsync(documentId, userId);
        if (existing is not null)
        {
            _context.DocumentShares.Remove(existing);
            await _context.SaveChangesAsync();
        }
    }

    public async Task<IEnumerable<DocumentSuggestion>> GetSuggestionsAsync(Guid documentId) =>
        await _context.DocumentSuggestions
            .Where(s => s.DocumentId == documentId)
            .OrderBy(s => s.CreatedAt)
            .ToListAsync();

    public async Task<DocumentSuggestion?> GetSuggestionAsync(Guid documentId, Guid suggestionId) =>
        await _context.DocumentSuggestions
            .FirstOrDefaultAsync(s => s.DocumentId == documentId && s.Id == suggestionId);

    public async Task<DocumentSuggestion> AddSuggestionAsync(DocumentSuggestion suggestion)
    {
        _context.DocumentSuggestions.Add(suggestion);
        await _context.SaveChangesAsync();
        return suggestion;
    }

    public async Task SetSuggestionStatusAsync(Guid documentId, Guid suggestionId, string status)
    {
        var existing = await GetSuggestionAsync(documentId, suggestionId);
        if (existing is null) throw new Exception("Suggestion not found");
        existing.Status = status;
        await _context.SaveChangesAsync();
    }
}