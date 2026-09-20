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
}