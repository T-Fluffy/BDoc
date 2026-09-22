using BDoc.Domain.Entities;
using BDoc.Domain.Interfaces;
using BDoc.Services;

namespace BDoc.Tests;

public class DocumentAccessTests
{
    private sealed class FakeRepo : IDocumentRepository
    {
        public readonly Dictionary<(Guid Doc, Guid User), DocumentShare> Shares = new();

        public Task<DocumentShare?> GetShareAsync(Guid documentId, Guid userId)
        {
            Shares.TryGetValue((documentId, userId), out var share);
            return Task.FromResult(share);
        }

        public Task<Document> GetByIdAsync(Guid id) => throw new NotImplementedException();
        public Task<IEnumerable<Document>> GetAllAsync() => throw new NotImplementedException();
        public Task CreateAsync(Document document) => throw new NotImplementedException();
        public Task UpdateAsync(Document document) => throw new NotImplementedException();
        public Task DeleteAsync(Guid id) => throw new NotImplementedException();
        public Task<IEnumerable<DocumentVersion>> GetVersionsAsync(Guid documentId) => throw new NotImplementedException();
        public Task<DocumentVersion?> GetVersionAsync(Guid documentId, Guid versionId) => throw new NotImplementedException();
        public Task<DocumentVersion> CreateVersionAsync(DocumentVersion version) => throw new NotImplementedException();
        public Task<IEnumerable<DocumentShare>> GetSharesAsync(Guid documentId) => throw new NotImplementedException();
        public Task<HashSet<Guid>> GetSharedDocumentIdsAsync(Guid userId) => throw new NotImplementedException();
        public Task<DocumentShare> UpsertShareAsync(DocumentShare share) => throw new NotImplementedException();
        public Task RevokeShareAsync(Guid documentId, Guid userId) => throw new NotImplementedException();
        public Task<IEnumerable<DocumentSuggestion>> GetSuggestionsAsync(Guid documentId) => throw new NotImplementedException();
        public Task<DocumentSuggestion?> GetSuggestionAsync(Guid documentId, Guid suggestionId) => throw new NotImplementedException();
        public Task<DocumentSuggestion> AddSuggestionAsync(DocumentSuggestion suggestion) => throw new NotImplementedException();
        public Task SetSuggestionStatusAsync(Guid documentId, Guid suggestionId, string status) => throw new NotImplementedException();
    }

    private static (FakeRepo Repo, Document Doc, Guid Owner, Guid Other) Setup()
    {
        var repo = new FakeRepo();
        var owner = Guid.NewGuid();
        var other = Guid.NewGuid();
        var doc = new Document { Id = Guid.NewGuid(), OwnerId = owner };
        return (repo, doc, owner, other);
    }

    [Fact]
    public async Task Owner_ReturnsOwner()
    {
        var (repo, doc, owner, _) = Setup();
        Assert.Equal("owner", await DocumentAccess.LevelAsync(repo, doc, owner));
    }

    [Fact]
    public async Task EditorShare_ReturnsEditor()
    {
        var (repo, doc, _, other) = Setup();
        repo.Shares[(doc.Id, other)] = new DocumentShare { DocumentId = doc.Id, SharedWithUserId = other, Permission = "editor" };
        Assert.Equal("editor", await DocumentAccess.LevelAsync(repo, doc, other));
    }

    [Fact]
    public async Task ViewerShare_ReturnsViewer()
    {
        var (repo, doc, _, other) = Setup();
        repo.Shares[(doc.Id, other)] = new DocumentShare { DocumentId = doc.Id, SharedWithUserId = other, Permission = "viewer" };
        Assert.Equal("viewer", await DocumentAccess.LevelAsync(repo, doc, other));
    }

    [Fact]
    public async Task Stranger_ReturnsNull()
    {
        var (repo, doc, _, other) = Setup();
        Assert.Null(await DocumentAccess.LevelAsync(repo, doc, other));
    }

    [Fact]
    public async Task NullUid_ReturnsNull()
    {
        var (repo, doc, owner, _) = Setup();
        Assert.Null(await DocumentAccess.LevelAsync(repo, doc, null));
    }
}
